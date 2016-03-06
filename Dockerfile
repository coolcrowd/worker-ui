FROM nginx

RUN echo 'debconf debconf/frontend select Noninteractive' | debconf-set-selections

RUN apt-get -qq update
RUN apt-get -qq install git -y
RUN apt-get -qq install nodejs -y
RUN ln -s /usr/bin/nodejs /usr/bin/node
RUN apt-get -qq install curl -y
RUN curl -q https://www.npmjs.com/install.sh | sh
COPY src /src
COPY resources /resources
COPY lib /lib
COPY gulp /gulp
COPY gulpfile.js /gulpfile.js
COPY package.json /package.json
RUN npm config set registry http://registry.npmjs.org/
RUN npm install
RUN npm install gulp -g
RUN gulp production
RUN rm -rf src/
RUN rm -rf gulp/
RUN ls /usr/share/nginx/html
RUN rm /usr/share/nginx/html/index.html
RUN ls /usr/share/nginx/html
RUN cp -avr /build/. /usr/share/nginx/html
RUN rm -rf build/