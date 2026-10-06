// A library: only definitions, no app hooks. Note the mixed formatting.
area_of(radius) -> pi * radius * radius;

circle_points(center, radius, count) -> map(range(count), _(i) -> (
      angle = i / count * 2 * pi;
      [center:0 + cos(angle)*radius, center:1 + sin(angle)*radius]
   )
);

place_circle(center, radius, block_name) -> (
   points = circle_points(center, radius, 32);
   for(points, set([_:0, center:2, _:1], block_name));
   length(points)
);

bounding_box(points) -> (
   xs = map(points, _:0);
   zs = map(points, _:1);
   [min(xs), min(zs), max(xs), max(zs)]
);

// a tiny keyed cache
cache_get(key) -> global_cache:key;

cache_put(key, value) -> (
   if(!global_cache, global_cache = {});
   global_cache:key = value;
   value
);

fib(n) -> if(n < 2, n, fib(n-1) + fib(n-2));

sum_squares(n) -> reduce(range(n), _(a, x) -> a + x*x, 0);
