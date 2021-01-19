#!/bin/bash

self=$( which $0 )
path=$( realpath "${self%/*}"/.. )

port=8009

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

function _avahi {
    local fn_search
    local _t
    if [ -z "$fn" ]; then
        fn_search='[^"]*'
    else
        fn_search="$fn"
    fi
    IFS="\n"
    for cast in "$( 
            avahi-browse --resolve -ktp _googlecast._tcp | \
            sed -Ene "s/^=.*;([^;]*);([^;]*);.*\"fn=($fn_search)\".*$/\1:\2:\3/p" \
        )"
    do
        _t=${cast%:*}
        ip=${_t%:*}
        port=${_t#*:}
        fn=${cast##*:}
        break
    done
}

function _gssdp {
    local urls=$( 
        gssdp-discover \
          -m available \
          -t urn:dial-multiscreen-org:device:dial \
          -n 1 | \
        sed -Ene 's/^\s*Location:\s(\S*).*$/\1/p' \
    )
    local fn_search
    local _t
    local _fn
    if [ -n "$fn" ]; then
        fn_search="$fn"
    else
        fn_search=".*"
    fi
    for url in "$urls"
    do
        _fn=$( 
            curl -s $url | \
            sed -Ene "s/^.*<friendlyName>($fn_search)<\/friendlyName>.*$/\1/p" \
        )
        if [ -n "$_fn" ]; then
            _t=${url#*//}
            ip=${_t%%:*}
            fn="$_fn"
            break
        fi
    done
}

if [ -z "$ip" ]; then 
    if command -v avahi-browse > /dev/null; then
        _avahi
    elif command -v gssdp-discover > /dev/null; then
        _gssdp
    fi

    if [ -z $ip ]; then
        echo "No Chromecast found!"
        exit 1
    fi
    echo "Found '$fn' at $ip"
fi

"${path}/build/castcontrol.js" $ip $port
