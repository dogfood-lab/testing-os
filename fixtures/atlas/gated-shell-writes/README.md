# gated-shell-writes

An Atlas fixture for a baseline a job writes by its own shell only when
run by hand, the shape accessibility-suite's update-baseline job has: the
job is held to `github.event_name == 'workflow_dispatch'` and redirects a
scan into `docs/baseline.json`. The write keeps the job's gate, as its
commit does.
