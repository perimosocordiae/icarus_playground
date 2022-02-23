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

function poll(pid) {
  fetch(`/poll/${pid}`)
    .then(maybeJson)
    .then((data) => {
      const output = document.getElementById('output');
      const done = data.status != 'running';
      if (data.status == 'error') {
        displayErrors(output, data.message)
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

function displayErrors(outputDiv, messages) {
  const errorHeader = document.createElement('span');
  errorHeader.classList.add('error_header');
  errorHeader.innerText = 'Error';
  outputDiv.appendChild(errorHeader);

  if (typeof messages == 'string') {
    outputDiv.appendChild(decodedError(messages));
    return;
  }

  for (const msg of messages) {
    const errorDiv = document.createElement('div');
    errorDiv.classList.add('error_message', msg.category, msg.name);
    for (const line of msg.message) {
      if (typeof line == 'object') {
        errorDiv.appendChild(sourceQuote(line));
      } else {
        errorDiv.appendChild(decodedError(line));
      }
    }
    outputDiv.appendChild(errorDiv);
  }
}

function decodedError(msg) {
  const errorDiv = document.createElement('div');
  errorDiv.classList.add('decoded');
  errorDiv.innerHTML = replaceAnsiColors(msg);
  return errorDiv;
}

function sourceQuote(lines) {
  // TODO: Highlight the corresponding line in the source on the right.
  const table = document.createElement('table');
  table.classList.add('source_quote');
  for (const [lineNumber, lineContent] of Object.entries(lines)) {
    const row = document.createElement('tr');
    const cell1 = document.createElement('td');
    cell1.classList.add('line_num');
    cell1.innerText = lineNumber;
    row.appendChild(cell1);
    const cell2 = document.createElement('td');
    cell2.innerText = lineContent;
    row.appendChild(cell2);
    table.appendChild(row);
  }
  return table;
}

// See https://en.wikipedia.org/wiki/ANSI_escape_code#Colors
function replaceAnsiColors(str) {
  return str.replace(/\x1B\[31;1m/g, '<span class="bold red">')
    .replace(/\x1B\[97;1m/g, '<span class="bold">')
    .replace(/\x1B\[0;1;31m/g, '</span><span class="bold red">')
    .replace(/\x1B\[0;1;34m/g, '</span><span class="bold blue">')
    .replace(/\x1B\[0;1;37m/g, '</span><span class="bold">')
    .replace(/\x1B\[0m/g, '</span>');
};

function chooseExample(sel) {
  window.location.replace('/' + sel.value);
}
