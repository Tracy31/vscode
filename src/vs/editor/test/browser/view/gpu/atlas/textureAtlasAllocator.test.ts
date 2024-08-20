/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, strictEqual } from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from 'vs/base/test/common/utils';
import type { ITextureAtlasAllocator } from 'vs/editor/browser/view/gpu/atlas/atlas';
import { TextureAtlasShelfAllocator } from 'vs/editor/browser/view/gpu/atlas/textureAtlasShelfAllocator';
import { TextureAtlasSlabAllocator, TextureAtlasSlabAllocatorOptions } from 'vs/editor/browser/view/gpu/atlas/textureAtlasSlabAllocator';
import { ensureNonNullable } from 'vs/editor/browser/view/gpu/gpuUtils';
import type { IRasterizedGlyph } from 'vs/editor/browser/view/gpu/raster/raster';

const blackArr = [0x00, 0x00, 0x00, 0xFF];

const pixel1x1 = createRasterizedGlyph(1, 1, [...blackArr]);
const pixel2x1 = createRasterizedGlyph(2, 1, [...blackArr, ...blackArr]);
const pixel1x2 = createRasterizedGlyph(1, 2, [...blackArr, ...blackArr]);

function createRasterizedGlyph(w: number, h: number, data: ArrayLike<number>): IRasterizedGlyph {
	strictEqual(w * h * 4, data.length);
	const source = new OffscreenCanvas(w, h);
	const imageData = new ImageData(w, h);
	imageData.data.set(data);
	ensureNonNullable(source.getContext('2d')).putImageData(imageData, 0, 0);
	return {
		source,
		boundingBox: { top: 0, left: 0, bottom: h - 1, right: w - 1 },
		originOffset: { x: 0, y: 0 },
	};
}

function allocateAndAssert(allocator: ITextureAtlasAllocator, rasterizedGlyph: IRasterizedGlyph, expected: { x: number; y: number; w: number; h: number } | undefined): void {
	const actual = allocator.allocate(rasterizedGlyph);
	if (!actual) {
		strictEqual(actual, expected);
		return;
	}
	deepStrictEqual({
		x: actual.x,
		y: actual.y,
		w: actual.w,
		h: actual.h,
	}, expected);
}

suite('TextureAtlasAllocator', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	suite('TextureAtlasShelfAllocator', () => {
		function initAllocator(w: number, h: number): { canvas: OffscreenCanvas; allocator: TextureAtlasShelfAllocator } {
			const canvas = new OffscreenCanvas(w, h);
			const allocator = new TextureAtlasShelfAllocator(canvas, 0);
			return { canvas, allocator };
		}

		test('single allocation', () => {
			const { allocator } = initAllocator(2, 2);
			// 1o
			// oo
			allocateAndAssert(allocator, pixel1x1, { x: 0, y: 0, w: 1, h: 1 });
		});
		test('wrapping', () => {
			const { allocator } = initAllocator(5, 4);

			// 1233o
			// o2ooo
			// ooooo
			// ooooo
			allocateAndAssert(allocator, pixel1x1, { x: 0, y: 0, w: 1, h: 1 });
			allocateAndAssert(allocator, pixel1x2, { x: 1, y: 0, w: 1, h: 2 });
			allocateAndAssert(allocator, pixel2x1, { x: 2, y: 0, w: 2, h: 1 });

			// 1233x
			// x2xxx
			// 44556
			// ooooo
			allocateAndAssert(allocator, pixel2x1, { x: 0, y: 2, w: 2, h: 1 });
			allocateAndAssert(allocator, pixel2x1, { x: 2, y: 2, w: 2, h: 1 });
			allocateAndAssert(allocator, pixel1x1, { x: 4, y: 2, w: 1, h: 1 });

			// 1233x
			// x2xxx
			// 44556
			// 7oooo
			allocateAndAssert(allocator, pixel1x1, { x: 0, y: 3, w: 1, h: 1 });
		});
		test('full', () => {
			const { allocator } = initAllocator(3, 2);
			// 122
			// 1oo
			allocateAndAssert(allocator, pixel1x2, { x: 0, y: 0, w: 1, h: 2 });
			allocateAndAssert(allocator, pixel2x1, { x: 1, y: 0, w: 2, h: 1 });
			allocateAndAssert(allocator, pixel1x1, undefined);
		});
	});

	suite('TextureAtlasSlabAllocator', () => {
		function initAllocator(w: number, h: number, options?: TextureAtlasSlabAllocatorOptions): { canvas: OffscreenCanvas; allocator: TextureAtlasSlabAllocator } {
			const canvas = new OffscreenCanvas(w, h);
			const allocator = new TextureAtlasSlabAllocator(canvas, 0, options);
			return { canvas, allocator };
		}

		test('single allocation', () => {
			const { allocator } = initAllocator(2, 2);
			// 1o
			// oo
			allocateAndAssert(allocator, pixel1x1, { x: 0, y: 0, w: 1, h: 1 });
		});

		test('single slab single glyph full', () => {
			const { allocator } = initAllocator(1, 1, { slabW: 1, slabH: 1 });

			// 1
			allocateAndAssert(allocator, pixel1x1, { x: 0, y: 0, w: 1, h: 1 });

			allocateAndAssert(allocator, pixel1x1, undefined);
		});

		test('single slab multiple glyph full', () => {
			const { allocator } = initAllocator(2, 2, { slabW: 2, slabH: 2 });

			// 1
			// 1
			allocateAndAssert(allocator, pixel1x2, { x: 0, y: 0, w: 1, h: 2 });
			allocateAndAssert(allocator, pixel1x2, { x: 1, y: 0, w: 1, h: 2 });

			allocateAndAssert(allocator, pixel1x2, undefined);
		});

		test('allocate 1x1 to multiple slabs until full', () => {
			const { allocator } = initAllocator(4, 2, { slabW: 2, slabH: 2 });

			// 12│oo
			// 34│oo
			allocateAndAssert(allocator, pixel1x1, { x: 0, y: 0, w: 1, h: 1 });
			allocateAndAssert(allocator, pixel1x1, { x: 1, y: 0, w: 1, h: 1 });
			allocateAndAssert(allocator, pixel1x1, { x: 0, y: 1, w: 1, h: 1 });
			allocateAndAssert(allocator, pixel1x1, { x: 1, y: 1, w: 1, h: 1 });

			// 12│56
			// 34│78
			allocateAndAssert(allocator, pixel1x1, { x: 2, y: 0, w: 1, h: 1 });
			allocateAndAssert(allocator, pixel1x1, { x: 3, y: 0, w: 1, h: 1 });
			allocateAndAssert(allocator, pixel1x1, { x: 2, y: 1, w: 1, h: 1 });
			allocateAndAssert(allocator, pixel1x1, { x: 3, y: 1, w: 1, h: 1 });

			allocateAndAssert(allocator, pixel1x1, undefined);
		});

		test('glyph too large for canvas', () => {
			const { allocator } = initAllocator(1, 1, { slabW: 1, slabH: 1 });
			allocateAndAssert(allocator, pixel2x1, undefined);
		});

		test('glyph too large for slab', () => {
			const { allocator } = initAllocator(2, 2, { slabW: 1, slabH: 1 });
			allocateAndAssert(allocator, pixel2x1, undefined);
		});

		test('separate slabs for different sized glyphs', () => {
			const { allocator } = initAllocator(4, 2, { slabW: 2, slabH: 2 });

			// 10│2o
			// 00│2o
			allocateAndAssert(allocator, pixel1x1, { x: 0, y: 0, w: 1, h: 1 });
			allocateAndAssert(allocator, pixel1x2, { x: 2, y: 0, w: 1, h: 2 });

			// 14│23
			// 00│23
			allocateAndAssert(allocator, pixel1x2, { x: 3, y: 0, w: 1, h: 2 });
			allocateAndAssert(allocator, pixel1x1, { x: 1, y: 0, w: 1, h: 1 });
		});
	});
});