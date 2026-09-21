use std::env;
use std::error::Error;
use std::fs;

use rust_learning_lab::{latest_for, parse_samples, summarize_joint};

const BUILT_IN_DATA: &str = include_str!("../data/samples.csv");

fn main() -> Result<(), Box<dyn Error>> {
    let mut arguments = env::args().skip(1);
    let path = arguments.next();
    let joint = arguments
        .next()
        .unwrap_or_else(|| "front_left_hip".to_owned());

    let input = match path {
        Some(path) => fs::read_to_string(path)?,
        None => BUILT_IN_DATA.to_owned(),
    };

    let samples = parse_samples(&input)?;

    match summarize_joint(&samples, &joint) {
        Some(stats) => {
            println!("joint: {}", stats.joint);
            println!("count: {}", stats.count);
            println!("mean_rad: {:.3}", stats.mean_rad);
            println!("range_rad: {:.3}..={:.3}", stats.min_rad, stats.max_rad);

            if let Some(latest) = latest_for(&samples, &joint) {
                println!("latest_rad: {:.3}", latest.position_rad);
            }
        }
        None => {
            println!("joint `{joint}` was not found");
        }
    }

    Ok(())
}
