#!/bin/bash
set -ex
. ./bamboo/abort-if-not-pr-or-master.sh

commit_message_contains_skip_audit_flag=false
commit_matches_version_tag=false

if [[ $(git log --pretty='format:%Creset%s' -1) =~ '[skip-audit]' ]]; then
  commit_message_contains_skip_audit_flag=true;
fi
if [[ $(git describe --exact-match HEAD 2>/dev/null |sed -n '1p') =~ ^v[0-9]+.* ]]; then
  commit_matches_version_tag=true;
fi

if [[ $commit_message_contains_skip_audit_flag = false && $commit_matches_version_tag = false ]]; then
  npm run install-locks;
  npm run audit;
else
  >&2 echo "******Skipping audit due to commit message/version tag being present"
fi
