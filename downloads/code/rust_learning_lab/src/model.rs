#[derive(Debug, Clone, PartialEq)]
pub struct Sample {
    pub joint: String,
    pub position_rad: f64,
}

impl Sample {
    pub fn new(joint: impl Into<String>, position_rad: f64) -> Self {
        Self {
            joint: joint.into(),
            position_rad,
        }
    }
}

#[derive(Debug, PartialEq)]
pub struct JointStats<'a> {
    pub joint: &'a str,
    pub count: usize,
    pub mean_rad: f64,
    pub min_rad: f64,
    pub max_rad: f64,
}
