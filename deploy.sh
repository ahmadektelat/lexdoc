#!/bin/bash
# Deploy the LexDoc app to Vercel (new project)
# The old index.html site is deployed separately via GitHub integration

set -e

echo "Building..."
npm run build

echo "Copying vercel.json to dist/..."
cp vercel.json dist/vercel.json

echo "Deploying to Vercel..."
vercel --prod ./dist

echo "Done!"
