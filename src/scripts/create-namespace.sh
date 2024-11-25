#!/bin/bash
set -e

NAMESPACE=$1

if [ -z "$NAMESPACE" ]; then
    echo "Usage: $0 <namespace>"
    exit 1
fi

# Create network namespace
ip netns add "$NAMESPACE"
ip netns exec "$NAMESPACE" ip link set lo up

# Setup resolv.conf for netns namespace
mkdir -p "/etc/netns/$NAMESPACE"
echo -e "nameserver 1.1.1.1\nnameserver 8.8.8.8" > "/etc/netns/$NAMESPACE/resolv.conf"