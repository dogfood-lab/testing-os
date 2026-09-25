# fork-gate

An Atlas fixture for a job held off a pull request from this repository,
the shape ai-rpg-stage's CI has: a same-repository pull request is the same
commit as the push that opened it, so the job runs on a push and on a pull
request from a fork only. A second workflow's job runs only on a pull
request from a fork.
