#!/bin/bash
# Create labels for the repository

gh label create "external-contribution" --color "0E8A16" --description "PR from a forked repository" --force
gh label create "bug" --color "d73a4a" --description "Something isn't working" --force
gh label create "enhancement" --color "a2eeef" --description "New feature or request" --force
gh label create "documentation" --color "0075ca" --description "Improvements or additions to documentation" --force
gh label create "good first issue" --color "7057ff" --description "Good for newcomers" --force
gh label create "help wanted" --color "008672" --description "Extra attention is needed" --force

echo "✅ Labels created successfully!"
