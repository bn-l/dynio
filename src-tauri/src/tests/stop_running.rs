use super::*;
use tokio::sync::oneshot;

#[tokio::test]
async fn kill_channel_default_has_no_sender() {
    let channel = KillChannel::default();
    let sender = channel.kill_sender.lock().await.take();
    assert!(sender.is_none());
}

#[tokio::test]
async fn kill_channel_can_store_and_retrieve_sender() {
    let channel = KillChannel::default();
    let (tx, _rx) = oneshot::channel::<()>();

    channel.kill_sender.lock().await.replace(tx);

    let sender = channel.kill_sender.lock().await.take();
    assert!(sender.is_some());
}

#[tokio::test]
async fn kill_channel_sender_fires_when_sent() {
    let channel = KillChannel::default();
    let (tx, rx) = oneshot::channel::<()>();

    channel.kill_sender.lock().await.replace(tx);

    // Take and send
    if let Some(sender) = channel.kill_sender.lock().await.take() {
        let _ = sender.send(());
    }

    // Receiver should get the signal
    let result = rx.await;
    assert!(result.is_ok());
}

#[tokio::test]
async fn kill_channel_take_twice_returns_none() {
    let channel = KillChannel::default();
    let (tx, _rx) = oneshot::channel::<()>();

    channel.kill_sender.lock().await.replace(tx);

    // First take succeeds
    let first = channel.kill_sender.lock().await.take();
    assert!(first.is_some());

    // Second take returns None
    let second = channel.kill_sender.lock().await.take();
    assert!(second.is_none());
}
