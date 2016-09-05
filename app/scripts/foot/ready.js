(function () {
  let totalTime = Date.now() - window.performance.timing.requestStart;
  console.log('total time', totalTime);

  if (document.location.search && window.top !== window && window.name !== 'remote') {
    window.top.postMessage(JSON.stringify({
      command: 'loaded'
    }), '*');

    var bodyEl = document.querySelector('body');
    window.top.postMessage(JSON.stringify({
      command: 'resize',
      data: {
        height: bodyEl.scrollHeight,
        width: bodyEl.scrollWidth
      }
    }), '*');
  }

  var autofocusEl = document.querySelector('[autofocus]');
  if (autofocusEl) {
    try {
      // focus any available autofocus element as one of the first things
      // done in case the view was rendered by the server. This fixes
      // an about:accounts bug where autofocus attributes
      // have no effect unless focused programatically.
      autofocusEl.focus();
    } catch(e) {
    }
  }

}());

