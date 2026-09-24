# package-publishers

Atlas fixtures, one repository per directory, each a package with a main:
unpublished has no workflow that publishes it; published runs npm publish on
a tag; declared marks itself "private": false and has a release workflow.
