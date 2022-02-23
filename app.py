#!/usr/bin/env python3
import dataclasses
import flask
import json
import logging
import os
import pathlib
import random
import shutil
import subprocess
import tempfile
from argparse import ArgumentParser
from typing import Dict, List, TextIO, Tuple


@dataclasses.dataclass
class Job:
    file: TextIO
    proc: subprocess.Popen

    @property
    def pid(self) -> int:
        return self.proc.pid


class PlaygroundApp(flask.Flask):
    icarus_base: pathlib.Path
    icarus_version: str
    running_jobs: Dict[int, Job] = {}

    def examples(self) -> Dict[str, pathlib.Path]:
        return {p.name: p for p in self.icarus_base.glob('examples/*.ic')}

    def command(self, source: str) -> List[str]:
        return ['stdbuf', '-oL', str(self.icarus_base / 'icarus'),
                '--module_paths', str(self.icarus_base / 'stdlib'),
                '--diagnostics=json', source]


app = PlaygroundApp(__name__)


@app.route('/')
@app.route('/<example>.ic')
def index(example=None):
    examples = app.examples()
    if example:
        example = f'{example}.ic'
    else:
        example = random.choice(list(examples.keys()))
    code = examples[example].open().read()
    return flask.render_template('index.html', demo_code=code,
                                 example=example, examples=examples,
                                 version=app.icarus_version)


@app.route('/run', methods=['POST'])
def run():
    code = flask.request.data.decode('utf-8')
    job = run_icarus_code(code)
    app.running_jobs[job.pid] = job
    app.logger.info('Started process %d', job.pid)
    return flask.jsonify(pid=job.pid)


@app.route('/poll/<int:pid>')
def poll(pid: int):
    try:
        proc = app.running_jobs[pid].proc
    except KeyError:
        return flask.jsonify(status='error', message='No such process')
    output = proc.stdout.read()
    output = '' if not output else output.decode('utf-8')
    if proc.poll() is None:
        return flask.jsonify(status='running', output=output)
    app.logger.info('Process %d finished with code %s', pid, proc.returncode)
    del app.running_jobs[pid]
    if proc.returncode == 0:
        return flask.jsonify(status='success', output=output)
    try:
        err_message = json.loads(output)
    except json.JSONDecodeError:
        app.logger.error('Failure output is not JSON: %s', output)
        err_message = output
    return flask.jsonify(status='error', message=err_message)


def run_icarus_code(code: str) -> Job:
    app.logger.info('User code:\n%s', code)
    f = tempfile.NamedTemporaryFile(mode='w+t', suffix='.ic')
    f.write(code)
    f.flush()
    command = app.command(f.name)
    app.logger.info('Command: %s', ' '.join(command))
    proc = subprocess.Popen(command,
                            stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT)
    os.set_blocking(proc.stdout.fileno(), False)
    return Job(f, proc)


def parse_flags():
    ap = ArgumentParser()
    ap.add_argument('--port', type=int, default=8787)
    ap.add_argument('--icarus-repo', default=os.path.expanduser(
        '~/Documents/Icarus'), help='Path to Icarus git repo')
    return ap.parse_args()


def main():
    flags = parse_flags()
    # Only run the setup code when running the 'main' app.
    if os.environ.get('WERKZEUG_RUN_MAIN') != 'true':
        app.run(host='0.0.0.0', port=flags.port, debug=True)
        return
    orig_icarus_repo = pathlib.Path(flags.icarus_repo)
    if not orig_icarus_repo.exists():
        raise ValueError('Icarus git repo not found')
    orig_binary_path = orig_icarus_repo / 'bazel-bin/compiler/interpret'
    if not orig_binary_path.exists():
        raise NotImplementedError('TODO: run bazel build')
    app.icarus_version = subprocess.check_output(
        ['git', '-C', str(orig_icarus_repo), 'rev-parse', 'HEAD'], text=True)
    app.logger.setLevel(logging.INFO)
    with tempfile.TemporaryDirectory(prefix='icarus_') as dirname:
        app.icarus_base = pathlib.Path(dirname)
        app.icarus_base.chmod(0o755)
        shutil.copyfile(orig_binary_path, app.icarus_base / 'icarus')
        (app.icarus_base / 'icarus').chmod(0o755)
        shutil.copytree(orig_icarus_repo / 'stdlib',
                        app.icarus_base / 'stdlib')
        shutil.copytree(orig_icarus_repo / 'examples',
                        app.icarus_base / 'examples')
        app.run(host='0.0.0.0', port=flags.port, debug=True)


if __name__ == '__main__':
    main()
