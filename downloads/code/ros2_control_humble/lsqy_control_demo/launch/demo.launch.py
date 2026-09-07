"""Humble-only, headless mock bringup; no real hardware and no physics engine."""

from pathlib import Path

from ament_index_python.packages import get_package_share_directory
from launch import LaunchDescription
from launch.actions import EmitEvent, LogInfo, RegisterEventHandler
from launch.event_handlers import OnProcessExit
from launch.events import Shutdown
from launch_ros.actions import Node


def generate_launch_description():
    package_share = Path(get_package_share_directory("lsqy_control_demo"))
    robot_description = (package_share / "urdf/two_joint_arm.urdf").read_text(
        encoding="utf-8"
    )
    controller_parameters = str(package_share / "config/controllers.yaml")

    state_publisher = Node(
        package="robot_state_publisher",
        executable="robot_state_publisher",
        parameters=[{"robot_description": robot_description, "use_sim_time": False}],
        output="screen",
    )
    control_manager = Node(
        package="controller_manager",
        executable="ros2_control_node",
        parameters=[controller_parameters],
        # 当前 Humble 接口：订阅 RSP 的描述话题，不用旧式 CM 参数直传。
        remappings=[("~/robot_description", "/robot_description")],
        output="screen",
    )
    spawner = Node(
        package="controller_manager",
        executable="spawner",
        arguments=[
            "joint_state_broadcaster",
            "arm_controller",
            "--controller-manager", "/controller_manager",
            "--controller-manager-timeout", "30",
            "--service-call-timeout", "10",
            "--switch-timeout", "10",
        ],
        output="screen",
    )

    def after_spawner(event, context):
        if context.is_shutdown:
            return []
        if event.returncode != 0:
            reason = f"Controller spawner failed (exit={event.returncode}); stopping demo"
            return [LogInfo(msg=reason), EmitEvent(event=Shutdown(reason=reason))]
        # 默认 spawner 成功执行 load -> configure -> activate 后退出是正常行为。
        return [LogInfo(msg="Mock ready: joint_state_broadcaster and arm_controller are active")]

    def after_required_process(event, context):
        if context.is_shutdown:
            return []
        return [EmitEvent(event=Shutdown(
            reason=f"Required bringup process exited (exit={event.returncode})"
        ))]

    # 先注册事件再启动进程，避免错过过早退出。
    # spawner 等 manager 服务，不用固定 TimerAction/sleep 猜测启动耗时。
    return LaunchDescription([
        RegisterEventHandler(OnProcessExit(target_action=spawner, on_exit=after_spawner)),
        RegisterEventHandler(OnProcessExit(
            target_action=state_publisher, on_exit=after_required_process
        )),
        RegisterEventHandler(OnProcessExit(
            target_action=control_manager, on_exit=after_required_process
        )),
        state_publisher,
        control_manager,
        spawner,
    ])
