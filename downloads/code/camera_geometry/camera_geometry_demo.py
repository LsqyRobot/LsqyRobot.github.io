"""Teaching geometry for UNDISTORTED pinhole images, Python 3.9+, no dependencies.

XYZ/range/depth use metres. Pixel centres are integers; image support is
[-0.5, width-0.5) x [-0.5, height-0.5). This is not a device SDK adapter:
validate confidence/status/units and obtain calibrated rays before using it.
Run: python3 camera_geometry_demo.py --self-test
"""

import argparse
from dataclasses import dataclass
from math import atan, degrees, floor, isclose, isfinite, isnan, nextafter, sqrt


@dataclass(frozen=True)
class CameraModel:
    width: int
    height: int
    fx: float
    fy: float
    cx: float
    cy: float

    def __post_init__(self):
        if any(not isinstance(n, int) or isinstance(n, bool) or n <= 0
               for n in (self.width, self.height)):
            raise ValueError("Image dimensions must be positive integers")
        if not all(isfinite(v) for v in (self.fx, self.fy, self.cx, self.cy)):
            raise ValueError("Intrinsics must be finite")
        if self.fx <= 0 or self.fy <= 0:
            raise ValueError("Focal lengths must be positive")

    def ray(self, u, v):
        """An unnormalised ray with z=1, NOT a unit vector."""
        if not all(isfinite(value) for value in (u, v)):
            raise ValueError("Pixel coordinates must be finite")
        return ((u - self.cx) / self.fx, (v - self.cy) / self.fy, 1.0)

    def project(self, point):
        x, y, z = point
        if not all(isfinite(value) for value in point) or z <= 0:
            raise ValueError("Point must be finite and in front of the camera")
        return (self.fx * (x / z) + self.cx, self.fy * (y / z) + self.cy)

    def depth_to_point(self, u, v, z):
        if not isfinite(z) or z <= 0:
            raise ValueError("Z depth must be finite and positive")
        return tuple(z * value for value in self.ray(u, v))

    def range_to_point(self, u, v, radial_range):
        """Use only when the input really is radial range, not SDK-converted Z."""
        if not isfinite(radial_range) or radial_range <= 0:
            raise ValueError("Range must be finite and positive")
        q = self.ray(u, v)
        norm = sqrt(sum(value * value for value in q))
        return tuple(radial_range * value / norm for value in q)

    def fov_deg(self):
        left = degrees(atan((-0.5 - self.cx) / self.fx))
        right = degrees(atan((self.width - 0.5 - self.cx) / self.fx))
        top = degrees(atan((-0.5 - self.cy) / self.fy))
        bottom = degrees(atan((self.height - 0.5 - self.cy) / self.fy))
        return dict(left=left, right=right, top=top, bottom=bottom,
                    horizontal=right - left, vertical=bottom - top)

    def crop(self, x0, y0, width, height):
        values = (x0, y0, width, height)
        if not all(isinstance(v, int) and not isinstance(v, bool) for v in values):
            raise ValueError("ROI must use integer pixel indices")
        if (x0 < 0 or y0 < 0 or width <= 0 or height <= 0
                or x0 + width > self.width or y0 + height > self.height):
            raise ValueError("ROI must lie inside the input image")
        return CameraModel(width, height, self.fx, self.fy,
                           self.cx - x0, self.cy - y0)

    def resize(self, width, height, *, center_aligned=True):
        sx, sy = width / self.width, height / self.height
        offset = 0.5 if center_aligned else 0.0
        return CameraModel(width, height, sx * self.fx, sy * self.fy,
                           sx * (self.cx + offset) - offset,
                           sy * (self.cy + offset) - offset)


IDENTITY = ((1.0, 0.0, 0.0), (0.0, 1.0, 0.0), (0.0, 0.0, 1.0))


def transform_point(point, rotation=IDENTITY, translation=(0.0, 0.0, 0.0)):
    """P_camera = R_camera_source * P_source + t_camera_source.

    R must be a calibrated, proper 3x3 rotation; t uses the same units as XYZ.
    This small example does not estimate or validate extrinsic calibration.
    """
    return tuple(sum(rotation[i][j] * point[j] for j in range(3))
                 + translation[i] for i in range(3))


def rasterize_z(points, camera, rotation=IDENTITY,
                translation=(0.0, 0.0, 0.0), *, z_min=1e-6):
    """Nearest-pixel, nearest-positive-Z projection; NaN means no observation.

    Input points must already pass device confidence/status checks. Sparse
    samples do not imply a continuous surface; this does not fill holes.
    """
    if not isfinite(z_min) or z_min <= 0:
        raise ValueError("z_min must be finite and positive")
    depth = [[float("nan") for _ in range(camera.width)]
             for _ in range(camera.height)]
    for source_point in points:
        if not all(isfinite(value) for value in source_point):
            continue
        point = transform_point(source_point, rotation, translation)
        if not all(isfinite(value) for value in point) or point[2] <= z_min:
            continue
        u, v = camera.project(point)
        if not (-0.5 <= u < camera.width - 0.5
                and -0.5 <= v < camera.height - 0.5):
            continue
        # Addition may round the last representable in-bounds value up to W/H.
        # Clamp only AFTER the continuous-coordinate boundary test above.
        col = min(camera.width - 1, floor(u + 0.5))
        row = min(camera.height - 1, floor(v + 0.5))
        z = point[2]
        if isnan(depth[row][col]) or z < depth[row][col]:
            depth[row][col] = z
    return depth


def self_test():
    camera = CameraModel(640, 480, 600, 600, 320, 240)
    p = (0.2, 0.1, 2.0)
    assert camera.project(p) == (380.0, 270.0)
    assert all(isclose(a, b) for a, b in zip(camera.depth_to_point(380, 270, 2), p))
    radial_range = sqrt(sum(value * value for value in p))
    assert all(isclose(a, b) for a, b in zip(camera.range_to_point(380, 270, radial_range), p))
    assert isclose(camera.range_to_point(920, 240, 2)[2], sqrt(2))
    assert camera.depth_to_point(920, 240, 2) == (2.0, 0.0, 2.0)
    crop = camera.crop(160, 120, 320, 240)
    assert crop.project(p) == (220.0, 150.0)
    for center_aligned in (True, False):
        resized = crop.resize(160, 120, center_aligned=center_aligned)
        offset = 0.5 if center_aligned else 0.0
        expected = tuple((value + offset) * 0.5 - offset for value in crop.project(p))
        assert resized.project(p) == expected
    # Center-aligned resize preserves the field of view at the pixel edges.
    assert isclose(crop.fov_deg()["horizontal"], crop.resize(160, 120).fov_deg()["horizontal"])
    axis_change = ((0, -1, 0), (0, 0, -1), (1, 0, 0))
    source_point = (5.0, -1.0, 0.5)
    assert transform_point(source_point, axis_change) == (1.0, -0.5, 5.0)
    assert camera.project(transform_point(source_point, axis_change)) == (440.0, 180.0)
    assert transform_point((0, 0, 1), translation=(1, 2, 3)) == (1, 2, 4)
    small = CameraModel(4, 3, 2, 2, 1, 1)
    points = [(0, 0, 3), (0, 0, 2), (0, 0, -1), (100, 0, 1),
              (float("nan"), 0, 1), (0, float("inf"), 1), (0, 0, 0)]
    for sample in (points, list(reversed(points))):
        depth = rasterize_z(sample, small)
        assert depth[1][1] == 2
        assert sum(isfinite(z) for row in depth for z in row) == 1
        assert isnan(depth[0][0])
    # Half-open pixel support, independent of language-specific round() ties.
    edges = [small.depth_to_point(u, v, 1) for u, v in
             [(-0.5, 0), (3.499999, 0), (3.5, 1), (0, 2.5), (-0.500001, 1)]]
    depth = rasterize_z(edges, small)
    assert depth[0][0] == depth[0][3] == 1
    assert sum(isfinite(z) for row in depth for z in row) == 2
    tiny = CameraModel(1, 1, 1, 1, 0, 0)
    just_inside = nextafter(0.5, -float("inf"))
    assert rasterize_z([(just_inside, just_inside, 1)], tiny)[0][0] == 1
    assert isnan(rasterize_z([(0.5, 0, 1), (0, 0.5, 1)], tiny)[0][0])
    for invalid in (0, -1, float("nan"), float("inf")):
        for method in (camera.depth_to_point, camera.range_to_point):
            try:
                method(320, 240, invalid)
            except ValueError:
                pass
            else:
                raise AssertionError("Invalid metric depth was accepted")
    print("PASS: projection, rays, range/Z, crop/resize, FOV, transforms, Z-buffer and invalid samples")
    for label, model in (("full", camera), ("center crop", camera.crop(160, 0, 320, 480)),
                         ("offset crop", camera.crop(240, 0, 320, 480))):
        fov = model.fov_deg()
        print(f"{label}: left={fov['left']:.4f}, right={fov['right']:.4f}, HFOV={fov['horizontal']:.4f} deg")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
    else:
        parser.print_help()
