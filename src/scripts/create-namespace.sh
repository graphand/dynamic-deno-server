#!/bin/bash
set -e

NAMESPACE=$1
[ -z "$NAMESPACE" ] && exit 1

BRIDGE_NAME="netns-bridge"
HASH=$(echo "$NAMESPACE" | md5sum | cut -c1-8)
VETH="veth_${HASH}"
VPEER="vpeer_${HASH}"

# Create namespace and setup
ip netns add "$NAMESPACE" 2>/dev/null || true
ip netns exec "$NAMESPACE" ip link set lo up

# DNS setup (simple approach)
mkdir -p "/etc/netns/$NAMESPACE"
echo "nameserver 1.1.1.1" > "/etc/netns/$NAMESPACE/resolv.conf"

# Calculate IP - compressed calculations
HEX_VALUE=$(echo "$HASH" | tr -d -c '0-9a-f' | head -c 8)
DEC_VAL=$(( 16#$HEX_VALUE % 4194303 + 2 ))
IP_ADDR="100.$(( (DEC_VAL / 65536) + 64 )).$(( (DEC_VAL / 256) % 256 )).$(( DEC_VAL % 256 ))"

# Create interfaces in one block
ip link add "$VETH" type veth peer name "$VPEER" && \
ip link set "$VETH" up && \
ip link set "$VPEER" netns "$NAMESPACE" && \
ip link set "$VETH" master "$BRIDGE_NAME" && \
ip netns exec "$NAMESPACE" ip link set "$VPEER" up && \
ip netns exec "$NAMESPACE" ip addr add "$IP_ADDR/10" dev "$VPEER" && \
ip netns exec "$NAMESPACE" ip route add default via 100.64.0.1



