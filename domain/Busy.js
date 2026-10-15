// Busy: reference-counted flag for "something is happening". Pure domain state,
// never persisted. Producers wrap work in begin()/end() or beginAndRun().
// Counting keeps overlapping operations from clearing the busy state before
// all finish. The PreloaderUI overlay subscribes to busyChanged events.
//
// Compromise: beginAndRun waits for a repaint before running the callback, then
// waits again before clearing the flag. This is heuristic, not a guarantee of
// completion: if work emits Bus events, those handlers may run after the flag
// clears. Reliable completion would require awaiting all macrotask queues.
const Busy = {

  count: 0,

  get isBusy() {
    return this.count > 0;
  },

  begin() {
    this.count++;
    if(this.count === 1) {
      Bus.emit(Bus.events.busyChanged, { busy: true });
    }
  },

  end() {
    if(this.count === 0) return;
    this.count--;
    if(this.count === 0) {
      Bus.emit(Bus.events.busyChanged, { busy: false });
    }
  },

  // Run callback while showing the overlay. Waits for a repaint (via
  // requestAnimationFrame twice), then runs the callback, then clears the flag
  // in a following macrotask. This ensures the overlay is painted before work
  // begins and remains visible during the callback.
  beginAndRun(callback) {
    this.begin();
    // Two rAF: first waits for pending paints, second guarantees a new frame
    // after the first is committed.
    let rafCount = 0;
    const nextStep = () => {
      rafCount++;
      if(rafCount < 2) {
        requestAnimationFrame(nextStep);
      } else {
        // rAF complete; now wait one macrotask to ensure the painted frame
        // is visible before the callback runs.
        setTimeout(() => {
          try {
            callback();
          } finally {
            setTimeout(() => this.end(), 0);
          }
        }, 0);
      }
    };
    requestAnimationFrame(nextStep);
  },
};
