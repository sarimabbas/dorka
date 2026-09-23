ARG BASE_IMAGE
FROM ${BASE_IMAGE}
USER 0
COPY tests/e2e/fixtures/dorka-native-linux-computer/agent-shim.sh /usr/local/bin/dorka-native-agent-shim
RUN chmod 0755 /usr/local/bin/dorka-native-agent-shim && \
    ln -s dorka-native-agent-shim /usr/local/bin/pi && \
    ln -s dorka-native-agent-shim /usr/local/bin/omp && \
    ln -s dorka-native-agent-shim /usr/local/bin/codex
