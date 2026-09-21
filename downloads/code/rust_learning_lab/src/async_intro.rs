use std::future::Future;
use std::sync::Arc;
use std::task::{Context, Poll, Wake, Waker};

use crate::model::{JointStats, Sample};
use crate::report::summarize_joint;

pub async fn summarize_async<'a>(samples: &'a [Sample], joint: &str) -> Option<JointStats<'a>> {
    summarize_joint(samples, joint)
}

struct NoopWake;

impl Wake for NoopWake {
    fn wake(self: Arc<Self>) {}
}

/// Polls a future that is known to become ready immediately.
///
/// This is a teaching aid, not a general-purpose async executor: it deliberately
/// fails if the future returns `Poll::Pending`.
pub fn run_ready<F: Future>(future: F) -> F::Output {
    let waker = Waker::from(Arc::new(NoopWake));
    let mut context = Context::from_waker(&waker);
    let mut future = Box::pin(future);

    match future.as_mut().poll(&mut context) {
        Poll::Ready(output) => output,
        Poll::Pending => panic!("run_ready only supports immediately-ready futures"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn immediate_future_can_be_polled_without_an_external_runtime() {
        let samples = vec![Sample::new("hip", 0.5)];
        let summary = run_ready(summarize_async(&samples, "hip")).expect("joint exists");

        assert_eq!(summary.mean_rad, 0.5);
    }
}
