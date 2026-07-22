.PHONY: test 

all: test 

deps: node_modules

node_modules:
	npm install

compile: deps
	npm run lint

test: compile
	npm run test

publish:
	npm run rel

update-overrides:
	npm run update:overrides
	
clean:
	rm -rf node_modules
	rm -f test/report.xml
	rm -rf ./coverage/
