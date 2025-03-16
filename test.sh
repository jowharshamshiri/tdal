#!/bin/bash
npm test

# Check if input file exists
if [ ! -f trash/jest-results.xml ]; then
  echo "Error: Input file trash/jest-results.xml not found"
  exit 1
fi

# Process XML: format, remove attributes, and save to minified-xml.xml
xmlstarlet fo --omit-decl trash/jest-results.xml | xmlstarlet ed -d "//@time" -d "//@classname" -d "//@name" > trash/jest-results-minified.xml

# Convert to YAML and use Perl to filter out empty array elements
yq -p=xml -o=yaml trash/jest-results-minified.xml | perl -ne 'print unless /^\s*-\s*$/' > trash/test-results.yaml

echo "Processing complete. Output saved to trash/test-results.yaml"
