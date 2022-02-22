var editor = ace.edit("editor");
editor.setTheme("ace/theme/monokai");
editor.setOptions({
  fontSize: "13pt",
  showGutter: window.innerWidth > 800,
});
editor.commands.addCommand({
  name: 'run',
  bindKey: { win: 'Ctrl-Enter', mac: 'Cmd-Enter' },
  exec: run,
});
editor.commands.addCommand({
  name: 'save',
  bindKey: { win: 'Ctrl-s', mac: 'Cmd-s' },
  exec: (editor) => {
    var a = document.createElement('a');
    var file = new Blob([editor.getValue()], { type: 'text/plain' });
    a.href = URL.createObjectURL(file);
    a.download = 'playground.ic';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); }, 0);
  },
});

var currentInterval = null;
const POLL_INTERVAL_MS = 250;

function run() {
  var code = editor.getValue();
  document.getElementById('output').innerHTML = '';
  document.querySelector('button').disabled = true;
  fetch('/run', { method: 'POST', body: code })
    .then(maybeJson)
    .then((data) => {
      currentInterval = setTimeout(poll, POLL_INTERVAL_MS, data.pid);
    }).catch(handleError);
}

function displayErrors(div, message) {
  // TODO: Edit the DOM directly rather than using the html-parsing facility in innerHTML
  div.innerHTML = message.map(e => {
    const error = e.message.map(component => {
      if (typeof(component) === "string") {
        return `<p>${component}</p>`;
      } else if (typeof(component) === "object") {
        // Source quote.
        // TODO: Highlight the corresponding line in the source on the right.
        const lines = []
        for (lineNumber in component) {
          console.log(component[lineNumber]);
          const lineContent = component[lineNumber];
          lines.push(`<tr>
            <td class="linenum">${lineNumber}</td>
            <td><pre class="source">${lineContent}</pre></td>
          </tr>`);
        }
        return '<table class="source">' + lines.join('') + '</table>';
      } else {
        console.warn("Ignoring component of type ", typeof(component));
      }
      return '';
    }).join('');
    return `
      <div class="error_message"><strong class="error_header">Error:</strong> ${error}</div>`;
  }).join('');
}

function poll(pid) {
  fetch(`/poll/${pid}`)
    .then(maybeJson)
    .then((data) => {
      const output = document.getElementById('output');
      const done = data.status != 'running';
      if (data.status == 'error') {
        var err = document.createElement('div');
        err.classList.add('stderr');
        output.style.backgroundColor = 'white';
        displayErrors(err, data.message)
        output.appendChild(err);
      } else {
        output.style.backgroundColor = 'antiquewhite';
        output.innerText = output.innerText + data.output;
      }
      if (done) {
        document.querySelector('button').disabled = false;
        currentInterval = null;
      } else {
        currentInterval = setTimeout(poll, POLL_INTERVAL_MS, pid);
      }
    }).catch(handleError);
}

function maybeJson(response) {
  if (!response.ok) throw Error(response.statusText);
  return response.json();
}

function handleError(err) {
  document.querySelector('button').disabled = false;
  console.log(err);
  const output = document.getElementById('output');
  output.style.backgroundColor = 'lightpink';
  output.innerText = err.message;
}

function chooseExample(sel) {
  window.location.replace('/' + sel.value);
}
