use rust_learning_lab::{Sample, apply_offset, latest_for};

fn consume(samples: Vec<Sample>) -> usize {
    samples.len()
}

fn main() {
    let mut samples = vec![Sample::new("hip", 0.4), Sample::new("hip", 0.6)];

    let latest = latest_for(&samples, "hip").expect("hip exists");
    println!("shared borrow: {:.1}", latest.position_rad);

    apply_offset(&mut samples, "hip", 0.1);
    println!("exclusive borrow: {:.1}", samples[1].position_rad);

    let count = consume(samples);
    println!("moved into consume: {count} samples");
    // println!("{}", samples.len()); // E0382: value used after move
}
