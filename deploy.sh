#!/usr/bin/env bash

killall node
cd /home/ec2-user/db
git fetch && git rebase
yarn

pushd eth
nohup npx ganache-cli -p 8545 &
npx truffle migrate
popd

pushd discord_bot
nohup node index.js &
popd

pushd web
nohup node index.js &
popd
