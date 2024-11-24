#!/bin/bash
set -e

NAMESPACE=$1

if [ -z "$NAMESPACE" ]; then
    echo "Usage: $0 <namespace>"
    exit 1
fi

# Clean up DNS configuration
rm -rf "/etc/netns/${NAMESPACE}"
ip netns del "${NAMESPACE}"
