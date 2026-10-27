import { useEffect, useRef, useState, type ChangeEvent } from "react";

import { Enums, init as initCornerstone, RenderingEngine, type Types} from '@cornerstonejs/core';

import {init as initTools, addTool, StackScrollTool, ToolGroupManager, Enums as ToolsEnums} from '@cornerstonejs/tools';

import dicomImageLoader from '@cornerstonejs/dicom-image-loader';

import * as dicomParser from 'dicom-parser';

initTools();
addTool(StackScrollTool);

export default function DicomViewer() {

    const containerRef = useRef<HTMLDivElement>(null);
    const viewportRef = useRef<Types.IStackViewport | null>(null);

    const [ready, setReady] = useState(false); 
    const [currentIndex, setCurrentIndex] = useState(0);
    const [imageCount, setImageCount] = useState(0);

    useEffect(() => {

        let cancelled = false;
        let engine: RenderingEngine | undefined;

        async function setup() {
            initCornerstone(); 
            
            if (cancelled || !containerRef.current) return;

            dicomImageLoader.init({
                useLegacyMetadataProvider: true,
            });

            engine = new RenderingEngine('dicom-engine');

            engine.enableElement({
                viewportId: 'dicom-viewport',
                type: Enums.ViewportType.STACK,
                element: containerRef.current,
            });

            viewportRef.current = engine.getViewport('dicom-viewport') as Types.IStackViewport;

            const toolGroup = ToolGroupManager.createToolGroup('dicom-tools');

            toolGroup?.addTool(StackScrollTool.toolName);
            toolGroup?.setToolActive(StackScrollTool.toolName, {
                bindings: [{ mouseButton: ToolsEnums.MouseBindings.Wheel }],
            });

            toolGroup?.addViewport('dicom-viewport', 'dicom-engine');

            setReady(true);
        }

        function handleNewImage() {
            const viewport = viewportRef.current;

            if (viewport) {
                setCurrentIndex(viewport.getCurrentImageIdIndex());
            }
        }

        containerRef.current?.addEventListener(
            Enums.Events.STACK_NEW_IMAGE,
            handleNewImage
        );

        void setup(); 
        
        // the clean up function
        return () => {
            cancelled = true;
            viewportRef.current = null;

            containerRef.current?.removeEventListener(
                Enums.Events.STACK_NEW_IMAGE,
                handleNewImage
            );

            ToolGroupManager.destroyToolGroup('dicom-tools');
            engine?.destroy();
            
        };
    }, []); 

    async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
        const files = Array.from(event.target.files ?? []);
        const viewport = viewportRef.current;

        if (files.length === 0 || !viewport) return;

        // Read the DICOM metadata for each file.
        const slices = await Promise.all(
            files.map(async (file) => {
                const buffer = await file.arrayBuffer();
                const dataSet = dicomParser.parseDicom(new Uint8Array(buffer));

                const position = dataSet
                    .string('x00200032') // Image Position (Patient)
                    ?.split('\\')
                    .map(Number);

                const orientation = dataSet
                    .string('x00200037') // Image Orientation (Patient)
                    ?.split('\\')
                    .map(Number);

                const seriesUID = dataSet.string('x0020000e'); // Series Instance UID

                return { file, position, orientation, seriesUID };
            })
        );

        // This example expects one series with position and orientation metadata.
        const seriesUID = slices[0].seriesUID;

        if (
            !seriesUID ||
            slices.some(
            (slice) =>
                slice.seriesUID !== seriesUID ||
                slice.position?.length !== 3 ||
                slice.orientation?.length !== 6 ||
                !slice.position.every(Number.isFinite) ||
                !slice.orientation.every(Number.isFinite)
            )
        ) {
            console.error(
            'Select one DICOM series with position and orientation metadata.'
            );
            return;
        }

        // Calculate the direction perpendicular to the image plane.
        const orientation = slices[0].orientation!;
        const [rx, ry, rz, cx, cy, cz] = orientation;

        const normal = [
            ry * cz - rz * cy,
            rz * cx - rx * cz,
            rx * cy - ry * cx,
        ];

        // Project each slice position onto that direction and sort by it.
        slices.sort((a, b) => {
            const positionA = a.position!;
            const positionB = b.position!;

            const distanceA = positionA.reduce(
                (sum, value, index) => sum + value * normal[index],
                0
            );

            const distanceB = positionB.reduce(
                (sum, value, index) => sum + value * normal[index],
                0
            );

            return distanceA - distanceB;
        });

        console.table(
            slices.map((slice) => ({
                file: slice.file.name,
                position: slice.position?.join(', '),
                series: slice.seriesUID,
            }))
        );

        const imageIds = slices.map((slice) =>
            dicomImageLoader.wadouri.fileManager.add(slice.file)
        );

        setCurrentIndex(0);
        setImageCount(imageIds.length);

        await viewport.setStack(imageIds);
        viewport.render();
    }

    return (
        <div>
            <input
                type="file"
                accept=".dcm,application/dicom"
                disabled={!ready}
                multiple
                onChange={handleFileChange}
            />

            <div
                ref={containerRef}
                style={{
                    width: '512px',
                    height: '512px',
                }}
            />
            <input
                type="range"
                min={0}
                max={Math.max(0, imageCount - 1)}
                value={currentIndex}
                disabled={imageCount <= 1}
                aria-label="Select image slice"
                onChange={(event) => {
                    const index = Number(event.target.value);
                    setCurrentIndex(index);
                    void viewportRef.current?.setImageIdIndex(index);
                }}
                style={{ width: '512px' }}
            />
            <p>{imageCount > 0 ? currentIndex + 1 : 0} / {imageCount}</p>
            <button onClick={() => {
                console.log(viewportRef.current?.getCurrentImageIdIndex())
                viewportRef.current?.scroll(1)
            }}>Next</button>
        </div>
    );
}
