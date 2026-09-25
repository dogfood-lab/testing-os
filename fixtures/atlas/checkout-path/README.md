# checkout-path

An Atlas fixture for a job that checks this repository out into a directory
of the workspace, beside another repository's checkout, the shape
ai-rpg-stage's CI has. A step at the workspace root reads the pins file
through the checkout's directory (stage/.github/pins.env), and a step in the
sibling checkout hands this repository's fixtures/ to its exporter
(--out=../stage/fixtures) and checks what it wrote. Paths spelled through
the checkout are this repository's; one handed to an output flag is
written by the door.
