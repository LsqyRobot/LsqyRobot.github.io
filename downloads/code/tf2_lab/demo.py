#!/usr/bin/env python3
"""Humble TF2 fixture: odom -> base_link -> laser_frame (MIT)."""
import math

import rclpy
from geometry_msgs.msg import TransformStamped
from rclpy.duration import Duration
from rclpy.node import Node
from tf2_ros import StaticTransformBroadcaster, TransformBroadcaster


class Demo(Node):
    def __init__(self):
        super().__init__('tf2_learning_demo')
        self.delay = self.declare_parameter('stamp_delay', 0.0).value
        if self.delay < 0.0:
            raise ValueError('stamp_delay must be nonnegative')
        self.static = StaticTransformBroadcaster(self)
        self.dynamic = TransformBroadcaster(self)
        fixed = TransformStamped()
        fixed.header.stamp = self.get_clock().now().to_msg()
        fixed.header.frame_id = 'base_link'
        fixed.child_frame_id = 'laser_frame'
        fixed.transform.translation.x = 0.3
        fixed.transform.translation.z = 0.2
        fixed.transform.rotation.z = math.sin(math.pi / 4)
        fixed.transform.rotation.w = math.cos(math.pi / 4)
        self.static.sendTransform(fixed)
        self.start = self.get_clock().now()
        self.timer = self.create_timer(0.05, self.tick)

    def tick(self):
        stamp = self.get_clock().now() - Duration(seconds=self.delay)
        # The pose is evaluated at its own timestamp, not current time.
        elapsed = (stamp - self.start).nanoseconds / 1e9
        transform = TransformStamped()
        transform.header.stamp = stamp.to_msg()
        transform.header.frame_id = 'odom'
        transform.child_frame_id = 'base_link'
        transform.transform.translation.x = 0.5 * math.sin(elapsed)
        transform.transform.rotation.w = 1.0
        self.dynamic.sendTransform(transform)


def main():
    rclpy.init()
    node = Demo()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        if rclpy.ok():
            rclpy.shutdown()


if __name__ == '__main__':
    main()
