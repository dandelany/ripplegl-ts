ripple-ts
=========

Ripple Tank, WebGL + Typescript

## Introduction
RippleGL is a ripple tank simulation that runs in the browser. 
It was originally written by Paul Falstad, as a Java Applet. 
Paul later adapted it to use GWT with the help of Iain Sharp, and converted the simulation code to WebGL for better performance.

This is a new rewrite of the old code in Typescript + React by me, Dan Delany. 
Most of Paul's WebGL simulation code remains, but I'd like to try to separate the UI layer from the simulation layer
and remove the dependency on the Java build system. 

This is mostly just a learning exercise for me and should not be taken as an attempt to build "The New Version" of
Ripple Tank :)


## License
This program is free software; you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation; either version 2 of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.

You should have received a copy of the GNU General Public License along with this program; if not, write to the Free Software Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301, USA.