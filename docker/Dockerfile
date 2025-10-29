FROM docker.m.daocloud.io/debian:bookworm-slim

# ENV DEBIAN_FRONTEND=noninteractive

# 更换为国内源加速
RUN if [ -f /etc/apt/sources.list ]; then \
        sed -i 's/deb.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list; \
    fi; \
    if [ -f /etc/apt/sources.list.d/debian.sources ]; then \
        sed -i 's/deb.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list.d/debian.sources; \
    fi


# Install common build & runtime dependencies. We keep the list reasonably small but
# sufficient for building Janus from source. You can extend/remove packages as needed.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        sudo ca-certificates \
        meson ninja-build cmake aptitude python3-pip \
        build-essential autoconf automake libtool pkg-config ca-certificates wget git \
        libssl-dev libglib2.0-dev libjansson-dev libmicrohttpd-dev libcurl4-openssl-dev \
        libnanomsg-dev libnice-dev libsrtp2-dev libconfig-dev libwebsockets-dev \
        libsofia-sip-ua-dev libopus-dev libogg-dev liblua5.3-dev \
    && rm -rf /var/lib/apt/lists/*

# Create unprivileged user to run janus and grant passwordless sudo
RUN useradd -m -s /bin/bash janus || true \
    && echo "janus ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/janus \
    && chmod 0440 /etc/sudoers.d/janus

WORKDIR /janus

# Copy entrypoint script (the real source will be mounted at runtime)
COPY docker/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
    && chown -R janus:janus /janus /usr/local/bin/docker-entrypoint.sh

# 切换默认用户为 janus（容器启动时以 janus 运行）
USER janus

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]