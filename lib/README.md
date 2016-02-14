SJCL is divided into modules implementing various cryptographic and
convenience functions. For our purpose we only need sha256.
We downloaded the project from
https://github.com/bitwiseshiftleft/sjcl
and built it with the following steps.

`./configure --without-all --with-sha256`

`make`

`make sjcl.js tidy`

See
https://github.com/bitwiseshiftleft/sjcl/blob/master/README/INSTALL
for more information.