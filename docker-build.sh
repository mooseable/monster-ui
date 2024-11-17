#!/bin/bash
set -e  # Exit immediately if a command exits with a non-zero status

DATATABLES_PATHS=(
    "'datatables.net': 'js/vendor/datatables/jquery.dataTables.min',"
    "'datatables.net-bs': 'js/vendor/datatables/dataTables.bootstrap.min',"
    "'datatables.net-buttons': 'js/vendor/datatables/dataTables.buttons.min',"
    "'datatables.net-buttons-html5': 'js/vendor/datatables/buttons.html5.min',"
    "'datatables.net-buttons-bootstrap':'js/vendor/datatables/buttons.bootstrap.min',"
    "'bootstraptour': 'js/vendor/bootstrap-tour.min',"
)

GITHUBREPO="https://github.com/kazoo-classic"

MAIN_JS="$(pwd)/src/js/main.js"
# Function to add a line to the paths object if it doesn't already exist
add_line_if_missing() {
    local line="$1"
    local file="$2"

    # Escape forward slashes for grep and sed
    local escaped_line=$(echo "$line" | sed 's/\//\\\//g')

    # Check if the line exists in the file
    if ! grep -qF "$line" "$file"; then
        # Insert the line before the closing '}' of the paths object
        # Assumes that 'paths: {' and the closing '}' are properly formatted
        sed -i "/paths\s*:\s*{/a \ \ \ \ \ \ \ \ \ \ \ \ \ \ \ \ $escaped_line" "$file"
        echo "Added line: $line"
    else
        echo "Line already exists: $line"
    fi
}
# Function to clone repo, copy files, and clean up
clone_and_copy() {
    local repo="$1"
    local branch="$2"
    local source_path="${3:-.}"  # Default to root of repo if no source path specified
    local dest_path="$4"
    local tmp_dir="$(pwd)/tmp"

    echo "Processing repo: $repo"
    mkdir -p "$tmp_dir"
    mkdir -p "$dest_path"

    # Clone the repository
    if [ -n "$branch" ]; then
        git clone -b "$branch" "$repo" "$tmp_dir"
    else
        git clone "$repo" "$tmp_dir"
    fi

    # Ensure destination directory exists
    mkdir -p "$(dirname "$dest_path")"

    # Copy files
    cp -rf "$tmp_dir/$source_path" "$dest_path"

    # Clean up
    rm -rf "$tmp_dir"
    echo "Completed processing: $repo"
}


if [[ "$1" == 'allapps' ]]; then
    echo "Adding callflows updates"
    clone_and_copy "$GITHUBREPO/monster-ui-callflows-ng.git" "bugfix/newqueue" "src" "$(pwd)/"

    echo "Adding callcenter app"
    clone_and_copy "$GITHUBREPO/monster-ui-callcenter.git" "bugfix/defaultscreen" "src" "$(pwd)/"

    echo "Adding whitelabel app"
    clone_and_copy "$GITHUBREPO/monster-ui-whitelabel.git" "" "src" "$(pwd)/"

    echo "Adding addressbooks app"
    clone_and_copy "$GITHUBREPO/monster-ui-addressbooks.git" "" "src" "$(pwd)/"

    echo "Adding non-build apps"

    echo "Adding resources app"
    clone_and_copy "$GITHUBREPO/monster-ui-resources.git" "" "." "$(pwd)/src/apps/resources"

    echo "Adding rates app"
    clone_and_copy "$GITHUBREPO/monster-ui-rates.git" "" "." "$(pwd)/src/apps/rates"

    echo "Adding registrations app"
    clone_and_copy "$GITHUBREPO/monster-ui-registrations.git" "" "." "$(pwd)/src/apps/registrations"

    echo "Adding voicemails app"
    clone_and_copy "$GITHUBREPO/monster-ui-voicemails.git" "4.3" "." "$(pwd)/src/apps/voicemails"

    echo "Adding recordings app"
    clone_and_copy "https://github.com/kazoo-classic/monster-ui-recordings.git" "" "." "$(pwd)/src/apps/recordings"

    echo "Adding SmartPBX app"
    clone_and_copy "$GITHUBREPO/monster-ui-voip.git" "4.3" "." "$(pwd)/src/apps/voip"

    echo "Adding Accounts app"
    clone_and_copy "$GITHUBREPO/monster-ui-accounts.git" "4.3" "." "$(pwd)/src/apps/accounts"

    echo "Adding CSV-Onboarding app"
    clone_and_copy "$GITHUBREPO/monster-ui-csv-onboarding.git" "4.3" "." "$(pwd)/src/apps/csv-onboarding"

    echo "Adding Fax app"
    clone_and_copy "$GITHUBREPO/monster-ui-fax.git" "4.3" "." "$(pwd)/src/apps/fax"

    echo "Adding Numbers app"
    clone_and_copy "$GITHUBREPO/monster-ui-numbers.git" "4.3" "." "$(pwd)/src/apps/numbers"

    echo "Adding PBXs app"
    clone_and_copy "$GITHUBREPO/monster-ui-pbxs.git" "4.3" "." "$(pwd)/src/apps/pbxs"

    echo "Adding Webhooks app"
    clone_and_copy "$GITHUBREPO/monster-ui-webhooks.git" "4.3" "." "$(pwd)/src/apps/webhooks"

    for line in "${DATATABLES_PATHS[@]}"; do
        add_line_if_missing "$line" "$MAIN_JS"
    done
fi

# Define build output directories on the host
BUILD_DIR_DIST="$(pwd)/monster-ui-build/dist"
BUILD_DIR_DISTDEV="$(pwd)/monster-ui-build/distDev"

# Create host build directories
mkdir -p "$BUILD_DIR_DIST"
mkdir -p "$BUILD_DIR_DISTDEV"

# Build the Docker image
echo "Building Docker image 'monster-ui-builder'..."
docker build -t monster-ui-builder .

# Create a unique container name (using current timestamp to avoid conflicts)
CONTAINER_NAME="monster-ui-builder-$(date +%s)"

# Run the container without volume mapping and with a specific name
echo "Running container '$CONTAINER_NAME'..."
docker run --name "$CONTAINER_NAME" monster-ui-builder

# Check if the container exited successfully
EXIT_CODE=$(docker inspect "$CONTAINER_NAME" --format='{{.State.ExitCode}}')
if [ "$EXIT_CODE" -ne 0 ]; then
  echo "Build failed with exit code $EXIT_CODE"
  docker logs "$CONTAINER_NAME"
  docker rm "$CONTAINER_NAME"
  exit 1
fi

# Copy build artifacts from the container to the host
echo "Copying build artifacts to host directories..."
docker cp "$CONTAINER_NAME:/var/www/dist/." "$BUILD_DIR_DIST/"
docker cp "$CONTAINER_NAME:/var/www/distDev/." "$BUILD_DIR_DISTDEV/"

# Remove the temporary container
echo "Removing temporary container '$CONTAINER_NAME'..."
docker rm "$CONTAINER_NAME"

if [[ "$1" == 'allapps' ]]; then

    #storage management app fails to minify. But it can just be included without minification and it works.
    echo "Adding storagemgmt app"
    clone_and_copy "$GITHUBREPO/monster-ui-storagemgmt.git" "" "src/apps/storagemgmt" "$BUILD_DIR_DIST/apps/storagemgmt"

    echo "Copying extra files"
    cp "$BUILD_DIR_DISTDEV/js/vendor/bootstrap-tour.min.js" "$BUILD_DIR_DIST/bootstraptour.js"
    cp "$BUILD_DIR_DISTDEV/js/vendor/datatables/jquery.dataTables.min.js" "$BUILD_DIR_DIST/datatables.net.js"
    cp "$BUILD_DIR_DISTDEV/js/vendor/datatables/dataTables.bootstrap.min.js" "$BUILD_DIR_DIST/datatables.net-bs.js"
    cp "$BUILD_DIR_DISTDEV/js/vendor/datatables/dataTables.buttons.min.js" "$BUILD_DIR_DIST/datatables.net-buttons.js"
    cp "$BUILD_DIR_DISTDEV/js/vendor/datatables/buttons.html5.min.js" "$BUILD_DIR_DIST/datatables.net-buttons-html5.js"
    cp "$BUILD_DIR_DISTDEV/js/vendor/datatables/buttons.bootstrap.min.js" "$BUILD_DIR_DIST/datatables.net-buttons-bootstrap.js"
fi


echo "Build artifacts have been successfully copied to '$BUILD_DIR_DIST'."
