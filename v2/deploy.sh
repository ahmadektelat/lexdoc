#!/bin/bash
# Deploy the LexDoc app to Vercel (new project)
# Run this from the v2/ directory

set -e

echo "Building..."
npm run build

echo "Copying vercel.json to dist/..."
cp vercel.json dist/vercel.json

echo "Deploying to Vercel..."
vercel --prod ./dist

echo "Done!"
