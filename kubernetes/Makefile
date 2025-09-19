# Define the output file
OUTPUT_FILE := _manifest.yaml

# Define the Kustomize build command
KUSTOMIZE_BUILD := kustomize build .

# The default target
all: build

$(OUTPUT_FILE):
	$(KUSTOMIZE_BUILD) > $(OUTPUT_FILE)

# Build the Kustomize configuration into the output file
build: clean $(OUTPUT_FILE)

# Deploy the manifest using kubectl apply
deploy: $(OUTPUT_FILE)
	kubectl apply -f $(OUTPUT_FILE)

# Clean up the output file
clean:
	rm -f $(OUTPUT_FILE)

.PHONY: all build deploy clean
