import * as fs from 'fs';
import resolve from 'rollup-plugin-node-resolve';
import svelte from 'rollup-plugin-svelte';

export default {
    input: 'src/main.js',
    output: {
        file: 'dist/bundle.js',
        format: 'iife'
    },
    plugins: [
		resolve(),
        svelte({
			extensions: ['.html'],
			include: 'src/components/**.html'
		})
    ]
};
