# start-order

Atlas fixtures for "Where to start" inside one part, one repository per
directory. In own-part/ the command's entry calls three files of its own
part, in an order that is not the order of their names; the path reads them
in the order the entry calls them. In single/ the entry imports nothing, so
the path is one file and is said in the singular.
In imports/ the entry registers its commands as callbacks, so it records no
order of work; the path reads the files it imports in the order it imports
them, which is not the order of their names.
