/**
 * D3.js Bar Plots for Taiwan Population Density Map
 * Scrollable version - shows 15 bars at a time with horizontal scroll for more
 */

const BarPlots = (function() {
    // Configuration
    const config = {
        margin: { top: 20, right: 20, bottom: 50, left: 60 },
        barPadding: 0.2,
        maxVisibleBars: 15, // Maximum bars to show without scrolling
        colors: {
            density: '#E9BB1F',
            population: '#629FA4'
        }
    };

    // State
    let initialized = false;
    let lastData = [];

    // Store chart state for animations
    const chartState = {
        density: { prevData: [], elements: null },
        population: { prevData: [], elements: null }
    };

    /**
     * Initialize the bar plots
     */
    function init() {
        if (initialized) return;

        if (typeof d3 === 'undefined') {
            console.error('BarPlots: D3.js is not loaded');
            return;
        }

        const densityContainer = document.getElementById('density-bar-plot');
        const populationContainer = document.getElementById('population-bar-plot');

        if (!densityContainer || !populationContainer) {
            console.error('BarPlots: Containers not found');
            return;
        }

        initialized = true;
        console.log('BarPlots: Initialized');

        // Render empty state
        renderChart('density-bar-plot', [], 'density');
        renderChart('population-bar-plot', [], 'population');
    }

    /**
     * Update both bar plots with new data
     */
    function update(data) {
        if (!initialized) {
            init();
        }

        if (!initialized) {
            console.warn('BarPlots: Not initialized, cannot update');
            return;
        }

        lastData = data || [];
        console.log('BarPlots: Updating with', lastData.length, 'items');

        // Sort and render (auto-scaling to fit container)
        const densityData = [...lastData]
            .sort((a, b) => b.density - a.density);

        const populationData = [...lastData]
            .sort((a, b) => b.population - a.population);

        renderChart('density-bar-plot', densityData, 'density');
        renderChart('population-bar-plot', populationData, 'population');
    }

    /**
     * Render a single bar chart - scrollable when more than maxVisibleBars
     */
    function renderChart(containerId, data, type) {
        const container = document.getElementById(containerId);
        if (!container) {
            console.error('BarPlots: Container not found:', containerId);
            return;
        }

        const d3Container = d3.select('#' + containerId);
        d3Container.selectAll('*').remove();

        const bounds = container.getBoundingClientRect();
        const containerWidth = bounds.width;
        const containerHeight = bounds.height;

        console.log('BarPlots: Rendering', type, 'at', containerWidth, 'x', containerHeight);

        if (containerWidth <= 0 || containerHeight <= 0) {
            console.warn('BarPlots: Container has no size:', containerId);
            const svg = d3Container.append('svg')
                .attr('width', '100%')
                .attr('height', '100%');
            svg.append('text')
                .attr('x', '50%')
                .attr('y', '50%')
                .attr('text-anchor', 'middle')
                .attr('dominant-baseline', 'middle')
                .style('fill', '#999')
                .style('font-size', '12px')
                .text('Loading...');
            return;
        }

        // Empty state
        if (data.length === 0) {
            const svg = d3Container.append('svg')
                .attr('width', containerWidth)
                .attr('height', containerHeight);
            svg.append('text')
                .attr('x', containerWidth / 2)
                .attr('y', containerHeight / 2)
                .attr('text-anchor', 'middle')
                .attr('dominant-baseline', 'middle')
                .style('fill', '#999')
                .style('font-size', '12px')
                .text('請選擇鄉鎮市區');
            return;
        }

        const numBars = data.length;
        const needsScroll = numBars > config.maxVisibleBars;

        // Fixed label settings for consistent appearance
        // Increased bottom margin to ensure rotated labels are fully visible
        const bottomMargin = 70;  // Increased from 50 to accommodate rotated labels
        const labelFontSize = 9;
        const labelMaxChars = 8;
        const labelRotation = -45;

        const margin = {
            top: config.margin.top,
            right: config.margin.right,
            bottom: bottomMargin,
            left: config.margin.left
        };

        // Calculate chart width based on whether we need scrolling
        let chartInnerWidth, svgWidth;
        const scrollbarHeight = 14; // Height reserved for scrollbar

        if (needsScroll) {
            // Calculate bar width based on showing maxVisibleBars in the visible area
            const visibleInnerWidth = containerWidth - margin.left - margin.right;
            const barWidthWithPadding = visibleInnerWidth / config.maxVisibleBars;
            chartInnerWidth = barWidthWithPadding * numBars;
            svgWidth = chartInnerWidth + margin.left + margin.right;
        } else {
            svgWidth = containerWidth;
            chartInnerWidth = containerWidth - margin.left - margin.right;
        }

        // Calculate inner height - account for scrollbar when scrolling is needed
        const effectiveHeight = needsScroll ? containerHeight - scrollbarHeight : containerHeight;
        const innerHeight = effectiveHeight - margin.top - margin.bottom;

        if (innerHeight <= 0) {
            console.warn('BarPlots: Inner height too small');
            return;
        }

        // Create wrapper structure for scrolling
        const wrapper = d3Container.append('div')
            .style('position', 'relative')
            .style('width', '100%')
            .style('height', '100%');

        // Fixed Y-axis SVG (always visible on the left)
        const yAxisSvg = wrapper.append('svg')
            .attr('class', 'y-axis-svg')
            .style('position', 'absolute')
            .style('left', '0')
            .style('top', '0')
            .style('width', margin.left + 'px')
            .style('height', effectiveHeight + 'px')
            .style('z-index', '2')
            .style('background', 'white');

        // Scrollable container for the chart
        const scrollContainer = wrapper.append('div')
            .attr('class', 'bar-plot-scroll')
            .style('position', 'absolute')
            .style('left', margin.left + 'px')
            .style('top', '0')
            .style('right', '0')
            .style('bottom', '0')
            .style('overflow-x', needsScroll ? 'auto' : 'hidden')
            .style('overflow-y', 'hidden');

        // Main chart SVG (inside scrollable container)
        // Use effectiveHeight which accounts for scrollbar when needed
        const chartSvgWidth = chartInnerWidth + margin.right;
        const chartSvg = scrollContainer.append('svg')
            .attr('width', chartSvgWidth)
            .attr('height', effectiveHeight);

        const chartG = chartSvg.append('g')
            .attr('transform', `translate(0,${margin.top})`);

        // Scales
        const xScale = d3.scaleBand()
            .domain(data.map(d => d.name))
            .range([0, chartInnerWidth])
            .padding(config.barPadding);

        const getValue = type === 'density' ? d => d.density : d => d.population;
        const maxValue = d3.max(data, getValue) || 1;

        const yScale = d3.scaleLinear()
            .domain([0, maxValue * 1.1])
            .range([innerHeight, 0]);

        // Grid lines
        chartG.append('g')
            .attr('class', 'grid')
            .selectAll('line')
            .data(yScale.ticks(5))
            .enter()
            .append('line')
            .attr('x1', 0)
            .attr('x2', chartInnerWidth)
            .attr('y1', d => yScale(d))
            .attr('y2', d => yScale(d))
            .attr('stroke', '#eee')
            .attr('stroke-dasharray', '2,2');

        // Helper function to truncate labels
        function truncateLabel(text, maxLength) {
            if (text.length <= maxLength) return text;
            return text.substring(0, maxLength) + '..';
        }

        // X Axis
        const xAxis = chartG.append('g')
            .attr('transform', `translate(0,${innerHeight})`)
            .call(d3.axisBottom(xScale).tickFormat(d => truncateLabel(d, labelMaxChars)));

        // Style x-axis labels
        xAxis.selectAll('text')
            .attr('transform', `rotate(${labelRotation})`)
            .style('text-anchor', 'end')
            .attr('dx', '-0.3em')
            .attr('dy', '0.15em')
            .style('font-size', labelFontSize + 'px');

        // Y Axis (in the fixed y-axis SVG)
        const yAxisG = yAxisSvg.append('g')
            .attr('transform', `translate(${margin.left - 1},${margin.top})`);

        yAxisG.call(d3.axisLeft(yScale)
            .ticks(5)
            .tickFormat(d => {
                if (d >= 1000000) return (d / 1000000).toFixed(1) + 'M';
                if (d >= 1000) return (d / 1000).toFixed(0) + 'K';
                return d;
            }))
            .selectAll('text')
            .style('font-size', '9px');

        // Add a white background rect behind y-axis to cover scrolling content
        yAxisSvg.insert('rect', ':first-child')
            .attr('width', margin.left)
            .attr('height', effectiveHeight)
            .attr('fill', 'white');

        // Bars with D3 transition - rise from bottom animation
        const barColor = config.colors[type];

        chartG.selectAll('.bar')
            .data(data, d => d.name)
            .enter()
            .append('rect')
            .attr('class', 'bar')
            .attr('x', d => xScale(d.name))
            .attr('width', xScale.bandwidth())
            // Start from bottom
            .attr('y', innerHeight)
            .attr('height', 0)
            .attr('fill', barColor)
            .attr('rx', Math.min(2, xScale.bandwidth() / 4))
            .attr('ry', Math.min(2, xScale.bandwidth() / 4))
            .style('cursor', 'pointer')
            .on('mouseover', function(event, d) {
                d3.select(this).attr('opacity', 0.7);
                const value = getValue(d);
                const formattedValue = type === 'density'
                    ? value.toLocaleString('zh-TW', { maximumFractionDigits: 1 }) + ' 人/km²'
                    : value.toLocaleString('zh-TW') + ' 人';
                showTooltip(event, d.name, formattedValue);
            })
            .on('mouseout', function() {
                d3.select(this).attr('opacity', 1);
                hideTooltip();
            })
            // D3 transition: animate rising from bottom
            .transition()
            .duration(500)
            .ease(d3.easeCubicOut)
            .delay((d, i) => i * 20)
            .attr('y', d => yScale(getValue(d)))
            .attr('height', d => innerHeight - yScale(getValue(d)));

        console.log('BarPlots:', type, 'chart rendered with', data.length, 'bars', needsScroll ? '(scrollable)' : '(fitted)');
    }

    /**
     * Show tooltip
     */
    function showTooltip(event, name, value) {
        let tooltip = d3.select('.bar-plot-tooltip');
        if (tooltip.empty()) {
            tooltip = d3.select('body').append('div')
                .attr('class', 'bar-plot-tooltip')
                .style('position', 'absolute')
                .style('background', 'white')
                .style('border', '1px solid #ccc')
                .style('border-radius', '4px')
                .style('padding', '8px 12px')
                .style('font-size', '12px')
                .style('box-shadow', '0 2px 8px rgba(0,0,0,0.15)')
                .style('pointer-events', 'none')
                .style('z-index', '1000');
        }
        tooltip
            .style('opacity', 1)
            .html(`<strong>${name}</strong><br/>${value}`)
            .style('left', (event.pageX + 10) + 'px')
            .style('top', (event.pageY - 30) + 'px');
    }

    /**
     * Hide tooltip
     */
    function hideTooltip() {
        d3.select('.bar-plot-tooltip').style('opacity', 0);
    }

    /**
     * Check if initialized
     */
    function isInitialized() {
        return initialized;
    }

    /**
     * Force re-render with last data
     */
    function refresh() {
        if (initialized && lastData.length > 0) {
            update(lastData);
        }
    }

    // Public API
    return {
        init,
        update,
        isInitialized,
        refresh
    };
})();

// Initialize when ready
(function() {
    function tryInit() {
        const densityContainer = document.getElementById('density-bar-plot');
        const populationContainer = document.getElementById('population-bar-plot');

        if (densityContainer && populationContainer) {
            console.log('BarPlots: Containers found, initializing...');
            BarPlots.init();
        } else {
            console.log('BarPlots: Containers not ready, retrying in 100ms...');
            setTimeout(tryInit, 100);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', tryInit);
    } else {
        tryInit();
    }
})();

// Also try to init after window load (ensures all CSS is applied)
window.addEventListener('load', function() {
    console.log('BarPlots: Window loaded, ensuring initialization...');
    BarPlots.init();
    // Force refresh after a delay to ensure layout is complete
    setTimeout(function() {
        console.log('BarPlots: Delayed refresh...');
        BarPlots.refresh();
    }, 500);
});
