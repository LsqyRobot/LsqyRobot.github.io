use rust_learning_lab::{ParseErrorKind, latest_for, parse_samples, summarize_joint};

#[test]
fn parses_and_summarizes_a_complete_workflow() {
    let samples = parse_samples("hip,0.2\nknee,1.0\nhip,0.6\n").expect("valid fixture");
    let stats = summarize_joint(&samples, "hip").expect("hip samples exist");

    assert_eq!(stats.count, 2);
    assert!((stats.mean_rad - 0.4).abs() < f64::EPSILON);
    assert_eq!(latest_for(&samples, "hip").unwrap().position_rad, 0.6);
}

#[test]
fn rejects_non_finite_sensor_values() {
    let error = parse_samples("hip,NaN\n").expect_err("NaN is not a physical sample");

    assert_eq!(error.line, 1);
    assert_eq!(error.kind, ParseErrorKind::NonFinitePosition);
}
