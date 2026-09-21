use crate::model::{JointStats, Sample};

pub fn latest_for<'a>(samples: &'a [Sample], joint: &str) -> Option<&'a Sample> {
    samples.iter().rev().find(|sample| sample.joint == joint)
}

pub fn summarize_joint<'a>(samples: &'a [Sample], joint: &str) -> Option<JointStats<'a>> {
    let mut matches = samples.iter().filter(|sample| sample.joint == joint);
    let first = matches.next()?;

    let mut count = 1;
    let mut sum = first.position_rad;
    let mut min = first.position_rad;
    let mut max = first.position_rad;

    for sample in matches {
        count += 1;
        sum += sample.position_rad;
        min = min.min(sample.position_rad);
        max = max.max(sample.position_rad);
    }

    Some(JointStats {
        joint: &first.joint,
        count,
        mean_rad: sum / count as f64,
        min_rad: min,
        max_rad: max,
    })
}

pub fn apply_offset(samples: &mut [Sample], joint: &str, offset_rad: f64) -> usize {
    let mut changed = 0;

    for sample in samples.iter_mut().filter(|sample| sample.joint == joint) {
        sample.position_rad += offset_rad;
        changed += 1;
    }

    changed
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mutable_borrow_updates_only_the_selected_joint() {
        let mut samples = vec![
            Sample::new("hip", 0.4),
            Sample::new("knee", 1.0),
            Sample::new("hip", 0.6),
        ];

        let changed = apply_offset(&mut samples, "hip", 0.1);

        assert_eq!(changed, 2);
        assert_eq!(samples[0].position_rad, 0.5);
        assert_eq!(samples[1].position_rad, 1.0);
        assert_eq!(samples[2].position_rad, 0.7);
    }
}
