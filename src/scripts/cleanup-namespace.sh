#!/bin/bash
set -e

NAMESPACE=$1

if [ -z "$NAMESPACE" ]; then
    echo "Usage: $0 <namespace>"
    exit 1
fi

# Clean up DNS configuration if it exists
if [ -d "/etc/netns/${NAMESPACE}" ]; then
    rm -rf "/etc/netns/${NAMESPACE}"
fi

# Remove network namespace if it exists
if ip netns list | grep -q "^${NAMESPACE}"; then
    ip netns del "${NAMESPACE}"
fi
