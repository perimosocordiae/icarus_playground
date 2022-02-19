#!/usr/bin/env python3
import dataclasses
import flask
import os
import pathlib
import random
import shutil
import subprocess
import tempfile
import time
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
    icarus_repo: pathlib.Path
    icarus_version: str
    binary_path: pathlib.Path
    running_jobs: Dict[int, Job] = {}

    def examples(self) -> Dict[str, pathlib.Path]:
        return {p.name: p for p in self.icarus_repo.glob('examples/*.ic')}

    def command(self, source: str) -> List[str]:
        return ['stdbuf', '-oL', str(self.binary_path), '--module_paths',
                str(self.icarus_repo / 'stdlib'), source]


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
    return flask.jsonify(status='error', message=output)


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
    app.icarus_repo = pathlib.Path(flags.icarus_repo)
    if not app.icarus_repo.exists():
        raise ValueError('Icarus git repo not found')
    binary_path = app.icarus_repo / 'bazel-bin/compiler/interpret'
    if not binary_path.exists():
        raise NotImplementedError('TODO: run bazel build')
    app.icarus_version = subprocess.check_output(
        ['git', '-C', str(app.icarus_repo), 'rev-parse', 'HEAD'], text=True)
    with tempfile.NamedTemporaryFile(mode='x') as f:
        f.close()
        shutil.copyfile(binary_path, f.name)
        app.binary_path = pathlib.Path(f.name)
        app.binary_path.chmod(0o755)
        app.run(host='0.0.0.0', port=flags.port, debug=True)


if __name__ == '__main__':
    main()
