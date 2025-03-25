#!/bin/bash
set -e

NAMESPACE=$1
[ -z "$NAMESPACE" ] && exit 1

# Calculate hash and cleanup in one go
HASH=$(echo "$NAMESPACE" | md5sum | cut -c1-8)
rm -rf "/etc/netns/${NAMESPACE}" 2>/dev/null || true
ip link delete "veth_${HASH}" 2>/dev/null || true
ip netns del "${NAMESPACE}" 2>/dev/null || true

# Note: We don't remove the bridge or global iptables rules as they are shared with other namespaces
