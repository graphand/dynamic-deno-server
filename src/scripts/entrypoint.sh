#!/bin/sh
set -e

# Create the bridge during container startup
BRIDGE_NAME="netns-bridge"
if ! ip link show "$BRIDGE_NAME" &> /dev/null; then
    ip link add name "$BRIDGE_NAME" type bridge
    ip link set "$BRIDGE_NAME" up
    ip addr add 100.64.0.1/10 dev "$BRIDGE_NAME"
    echo 1 > /proc/sys/net/ipv4/ip_forward
    iptables -t nat -A POSTROUTING -s 100.64.0.0/10 -j MASQUERADE
    iptables -A FORWARD -i "$BRIDGE_NAME" -j ACCEPT
    iptables -A FORWARD -o "$BRIDGE_NAME" -j ACCEPT
fi

# Cleanup function
cleanup() {
    # Directly process namespaces without echo messages
    ip netns list 2>/dev/null | grep -o "ns_[^ ]*" | xargs -r -n1 /app/src/scripts/cleanup-namespace.sh >/dev/null 2>&1
    exit 0
}

# Trap signals
trap cleanup SIGTERM SIGINT

# Start application
exec "$@"