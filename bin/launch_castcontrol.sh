#!/bin/bash

self=$( which $0 )
path=$( realpath "${self%/*}"/.. )

fn='[^"]*'
port=8809

while (( "$#" )); do
    case "$1" in
        -h|--help)
            cat <<EOF
Usage: $0 [OPTIONS]

Options:
    -h, --help
    -ip  <ip address>  connect to the cast at this ip address 
    -p   8009          port
    -fn  <cast name>   connect to the cast with the given friendly name

$0 will connect to the first cast found if given no arguments.
EOF
            exit 1
            ;;
        -ip)
            ip=$2
            shift 2
            ;;
        -fn)
            fn=$2
            shift 2
            ;;
        *) # maybe useful one day
            rest="$1"
            shift
            ;;
    esac
done

if [ -z $ip ]; then 
    # TODO: ought to handle multiple lines of Chromecasts.
    eval $( avahi-browse --resolve -ktp _googlecast._tcp | sed -Ene "s/^=.*;([^;]*);([^;]*);.*\"fn=($fn)\".*$/ip=\1\nport=\2\nfn=\"\3\"/p" )

    if [ -z $ip ]; then
        echo "No Chromecast found!"
        exit 1
    fi
    echo "Found '$fn' at $ip:$port"
fi

${path}/build/castcontrol.js $ip $port


