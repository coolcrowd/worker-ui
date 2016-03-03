FROM nginx

RUN echo 'debconf debconf/frontend select Noninteractive' | debconf-set-selections

RUN apt-get -qq update \
    apt-get -qq install git -y \
    apt-get -qq install nodejs -y \
    ln -s /usr/bin/nodejs /usr/bin/node \
    apt-get -qq install curl -y \
    curl -q https://www.npmjs.com/install.sh | npm_install=2.14.18 sh \
    npm install gulp -g
COPY . .
RUN npm install gulp \
    npm install \
    gulp production \
    rm -rf src/ \
    rm -rf gulp/ \
    cp -avr /build /usr/share/nginx/html