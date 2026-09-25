# shipped-actions

An Atlas fixture for actions a repository ships to other repositories, the
shapes audiobooker and the organization `.github` repository have: a root
`action.yml` whose composite step runs a script through
`github.action_path`, and `.github/actions/audit/action.yml`, which no
workflow here uses. `.github/actions/setup/action.yml` is used by this
repository's own CI, so it is part of that workflow and no door.
