use rust_learning_lab::Sample;
use rust_learning_lab::async_intro::{run_ready, summarize_async};

fn main() {
    let samples = vec![Sample::new("hip", 0.25), Sample::new("hip", 0.75)];
    let summary = run_ready(summarize_async(&samples, "hip")).expect("hip exists");

    println!("async mean: {:.2}", summary.mean_rad);
}
