// A small but complete scarpet app, written the way people actually write them.
__config() -> {
   'scope' -> 'global',
   'stay_loaded' -> true,
   'commands' -> {
      'mark' -> 'cmd_mark',
      'list' -> 'cmd_list',
      'clear' -> 'cmd_clear'
   },
   'arguments' -> {
      'mark' -> {'name' -> {'type' -> 'string', 'suggest' -> ['home','mine','base']}}
   }
};

__on_start() -> (
   global_marks = {};
   global_counter = 0
);

cmd_mark(name) -> (
   p = player();
   global_marks:name = {'pos' -> pos(p), 'dim' -> query(p,'dimension'), 'when' -> unix_time()};
   global_counter = global_counter + 1;
   print(p, 'marked ' + name + ' at ' + str(pos(p)))
);

cmd_list() -> (
   if(length(global_marks) == 0, print('no marks yet'), (
      for(pairs(global_marks),
         key = _:0; value = _:1;
         print(key + ' -> ' + str(value:'pos') + ' in ' + value:'dim')
      )
   ))
);

cmd_clear() -> (
   global_marks = {};
   global_counter = 0;
   print('all marks cleared')
);

__on_tick() -> (
   counter = counter + 1;
   if(counter % 100 != 0, return());
   for(global_marks, m = _;
      p = player('*');
      if(p == null, break());
      distance = length(pos(p) - m:'pos');
      if(distance < 5 && m:'dim' == query(p,'dimension'),
         print(p, 'you are standing on ' + str(m))
      )
   )
);

__on_close() -> print('bye, ' + str(global_counter) + ' marks were made');
