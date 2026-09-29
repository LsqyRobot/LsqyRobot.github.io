#!/usr/bin/env python3
"""Check transform direction, chaining and time errors against demo.py (MIT)."""
import json
import math
import time

import rclpy
import tf2_geometry_msgs  # noqa: F401: registers geometry message conversions
from geometry_msgs.msg import PointStamped
from rclpy.duration import Duration
from rclpy.time import Time
from tf2_ros import Buffer, TransformListener, LookupException, ExtrapolationException


def xyz(vector):
    return [vector.x, vector.y, vector.z]


def close(actual, expected):
    assert all(math.isclose(a, b, abs_tol=1e-6) for a, b in zip(actual, expected)), (
        actual, expected)


def main():
    rclpy.init()
    node = rclpy.create_node('tf2_learning_probe')
    buffer = Buffer(cache_time=Duration(seconds=10.0))
    listener = TransformListener(buffer, node)
    report = {}
    try:
        deadline = time.monotonic() + 10.0
        while not buffer.can_transform('odom', 'laser_frame', Time()):
            if time.monotonic() > deadline:
                raise RuntimeError('No complete TF chain within 10 seconds; start demo.py first')
            rclpy.spin_once(node, timeout_sec=0.1)
        forward = buffer.lookup_transform('base_link', 'laser_frame', Time())
        close(xyz(forward.transform.translation), [0.3, 0.0, 0.2])
        reverse = buffer.lookup_transform('laser_frame', 'base_link', Time())
        close(xyz(reverse.transform.translation), [0.0, 0.3, -0.2])
        point = PointStamped()
        point.header.frame_id = 'laser_frame'
        point.point.x = 1.0
        # Zero stamp means latest; this edge is static.
        converted = buffer.transform(point, 'base_link')
        close(xyz(converted.point), [0.3, 1.0, 0.2])
        chain = buffer.lookup_transform('odom', 'laser_frame', Time())
        dynamic = buffer.lookup_transform('odom', 'base_link', Time())
        close(xyz(chain.transform.translation),
              [dynamic.transform.translation.x + 0.3, 0.0, 0.2])
        report['forward_translation'] = xyz(forward.transform.translation)
        report['inverse_translation'] = xyz(reverse.transform.translation)
        report['point_in_base_link'] = xyz(converted.point)
        report['chain_translation'] = xyz(chain.transform.translation)
        report['latest_age_seconds'] = (
            node.get_clock().now() - Time.from_msg(dynamic.header.stamp)).nanoseconds / 1e9
        cases = [
            ('missing_frame', 'not_a_frame', Time(), LookupException),
            ('future', 'odom', node.get_clock().now() + Duration(seconds=60),
             ExtrapolationException),
            ('past', 'odom', node.get_clock().now() - Duration(seconds=60),
             ExtrapolationException),
        ]
        for name, target, stamp, expected in cases:
            try:
                buffer.lookup_transform(target, 'laser_frame', stamp)
            except expected as error:
                report[name] = {'type': type(error).__name__, 'message': str(error)}
            else:
                raise AssertionError(f'{name}: expected {expected.__name__}')
        report['passed'] = True
        print(json.dumps(report, ensure_ascii=False, indent=2))
    finally:
        del listener
        node.destroy_node()
        rclpy.shutdown()


if __name__ == '__main__':
    main()
