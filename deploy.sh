#!/bin/bash
# Deploy the LexDoc app to Vercel (new project)
# The old index.html site is deployed separately via GitHub integration

set -e

echo "Building..."
npm run build

echo "Preparing dist/..."
mv dist/app.html dist/index.html
cp vercel.json dist/vercel.json

echo "Deploying to Vercel..."
vercel --prod ./dist

echo "Done!"
