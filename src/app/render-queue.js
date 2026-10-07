// --- One render at a time --------------------------------------------------
// The queue of render() (src/app/render.js), as pure logic: what is drawn is
// renderOnce's, when it runs is this module's.
//
//   const render = makeRenderQueue(renderOnce);
//   await render();     // the preview is the newest render's
//
//   - One at a time. A render requested while another runs starts when that
//     one is finished; renderOnce reads the source then, so the preview ends
//     as the last one's.
//   - A newer request aborts the render before it: each render gets the
//     AbortSignal of a controller of its own, aborted once the next render
//     is requested. A layout of BPMN still running in its worker is given up
//     at once (src/app/layout-client.js), so Ctrl+Enter during a layout of
//     many seconds acts now and not after it; a render whose signal is
//     aborted before its turn is not run at all.
//   - The promise is fulfilled when the preview is the newest render's,
//     however many renders are requested after this one: whoever waits for
//     it, an export above all, never copies a preview that a newer render is
//     about to replace, nor one with the notice of a layout given up. It is
//     never rejected: renderOnce contains its own failures, and the queue
//     goes on even if it did not.
//
// Pure logic: renderOnce is handed in, and nothing is done on loading;
// tests/render-queue.test.mjs runs it in Node.
export function makeRenderQueue(renderOnce){
  let last = Promise.resolve();
  let controller = null;
  // Settles when the render last requested has, however many come after
  // the one that asked: a render requested while this waits is waited for too.
  async function newest(){
    let waited;
    do { waited = last; await waited; } while (waited !== last);
  }
  return function render(){
    if (controller) controller.abort();
    const { signal } = controller = new AbortController();
    // A newer render was requested before this one began: that one shows the source.
    const run = () => { if (!signal.aborted) return renderOnce(signal); };
    // The second argument keeps the queue alive if renderOnce ever rejected.
    last = last.then(run, run);
    return newest();
  };
}
