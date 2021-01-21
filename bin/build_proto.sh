#!/bin/bash

node_modules/protobufjs/bin/pbjs -t static-module -w es6 -o build/cast_channel.proto.js lib/cast_channel.proto

sed -i -E -e 's/^import \* as (.*)"([^.]*)";/import \1"\2.js";/' build/cast_channel.proto.js
